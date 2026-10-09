import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DecisionMemory } from "../../../packages/decision-memory/src/index.js";
import { WorkMemoryService } from "../src/work-memory-service.js";
import { WorkMemoryHandoffError, WorkMemoryHandoffService } from "../src/work-memory-handoff.js";

class MemoryStore {
  constructor({ workspace, workItem }) {
    this.workspace = workspace;
    this.workItem = workItem;
    this.sessions = {
      "session:source": {
        id: "session:source",
        machineId: "machine:1",
        cwd: workspace,
        nativeSessionId: "native:source",
      },
    };
    this.decisions = [];
    this.activity = [
      { id: "a1", workItemId: workItem.id, type: "work_item.claimed", actor: { id: "codex", kind: "agent" }, details: {}, at: "2026-10-08T15:20:00Z" },
    ];
  }
  getSession(id) { return this.sessions[id]; }
  getWorkItem(id) { return id === this.workItem.id ? structuredClone(this.workItem) : undefined; }
  listDecisions() { return structuredClone(this.decisions); }
  listActivity() { return structuredClone(this.activity); }
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-handoff-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  t.after(() => rm(root, { recursive: true, force: true }));
  const memory = await DecisionMemory.init(workspace, "acceptance/repository");
  await memory.log({
    claim: "Use evidence-first continuation",
    choice: "Carry only verified shareable decisions",
    rationale: "Prevents unverified workspace prose from becoming authority",
    source: "test://work-memory-handoff",
    sourceHash: "source-sha-001",
    actor: "test",
    verification: "verified",
    sensitivity: "shareable",
  });
  return { workspace, memory };
}

function workItem() {
  return {
    id: "work:1",
    projectId: "project:1",
    title: "Finish continuity bridge",
    description: "Bind Work Memory projection to RE-297 handoff",
    lane: "in_progress",
    humanOnly: false,
    owner: { id: "codex", kind: "agent", provider: "openai" },
    completionReport: null,
    createdAt: "2026-10-08T15:00:00Z",
    updatedAt: "2026-10-08T15:20:00Z",
  };
}

test("handoff binds exact Work Memory projection digest into RE-297 snapshot", async (t) => {
  const { workspace, memory } = await fixture(t);
  const store = new MemoryStore({ workspace, workItem: workItem() });
  const projectionService = new WorkMemoryService(store);
  const projection = projectionService.getProjection("work:1");
  const service = new WorkMemoryHandoffService(store, projectionService);

  const created = await service.create("work:1", {
    fromSessionId: "session:source",
    nextAction: "Continue with a fresh verifier session",
  });

  assert.equal(created.receipt.workId, "work:1");
  assert.equal(created.receipt.projectionDigest, projection.digest);
  assert.equal(created.receipt.snapshotHash, created.handoff.contentHash);
  assert.equal(created.receipt.authority.workState, "project-desk");
  assert.equal(created.receipt.authority.verifiedDecisionMemory, "RE-297");
  assert.equal(created.receipt.authority.mutableThroughReceipt, false);
  assert.ok(created.handoff.checks.includes(`work-memory-sha256:${projection.digest}`));
  assert.equal(created.handoff.nextAction, "Continue with a fresh verifier session");

  const view = await memory.load();
  assert.equal(view.handoffs[created.handoff.id].contentHash, created.handoff.contentHash);
  assert.equal(view.handoffs[created.handoff.id].decisions.length, 1);
});

test("handoff derives pending human decisions as open tasks and risks", async (t) => {
  const { workspace } = await fixture(t);
  const item = workItem();
  const store = new MemoryStore({ workspace, workItem: item });
  store.decisions.push({
    id: "decision:1",
    workItemId: item.id,
    kind: "completion",
    question: "Approve completion?",
    status: "pending",
    requestedBy: { id: "codex", kind: "agent" },
    requestedAt: "2026-10-08T15:21:00Z",
    resolvedBy: null,
    resolvedAt: null,
    comment: null,
  });
  const service = new WorkMemoryHandoffService(store, new WorkMemoryService(store));
  const created = await service.create(item.id, { fromSessionId: "session:source" });

  assert.ok(created.handoff.openTasks.some((task) => task.includes("decision:1")));
  assert.ok(created.handoff.risks.some((risk) => risk.includes("decision:1")));
  assert.match(created.handoff.nextAction, /Resolve pending human decisions/);
});

test("handoff refuses unknown source sessions and workspaces without verified memory", async (t) => {
  const { workspace } = await fixture(t);
  const item = workItem();
  const store = new MemoryStore({ workspace, workItem: item });
  const service = new WorkMemoryHandoffService(store, new WorkMemoryService(store));

  await assert.rejects(
    service.create(item.id, { fromSessionId: "missing" }),
    (error) => error instanceof WorkMemoryHandoffError && error.code === "source_session_not_found",
  );

  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-no-memory-"));
  const emptyWorkspace = path.join(emptyRoot, "workspace");
  await mkdir(emptyWorkspace);
  t.after(() => rm(emptyRoot, { recursive: true, force: true }));
  store.sessions["session:no-memory"] = { id: "session:no-memory", machineId: "machine:1", cwd: emptyWorkspace };
  await assert.rejects(
    service.create(item.id, { fromSessionId: "session:no-memory" }),
    (error) => error instanceof WorkMemoryHandoffError && error.code === "decision_memory_unavailable",
  );
});
