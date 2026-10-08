import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProjectContextStore, canonicalJson, sha256 } from "../src/project-context-store.js";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-work-os-context-"));
}

function fixture(overrides = {}) {
  return {
    schemaVersion: "project-context/v1",
    projectId: "alpha",
    revision: "r1",
    updatedAt: "2026-10-08T18:00:00.000Z",
    summary: "Build a deterministic private context handoff for coding agents.",
    vocabulary: {
      Brainspace: "Private project knowledge stored outside the target source repository.",
      Handoff: "The exact bounded context delivered to one agent run.",
    },
    constraints: [
      "Do not authorize push, merge, deploy, or provider writes through context.",
      "Keep execution state separate from durable project knowledge.",
    ],
    decisions: [
      { id: "D001", status: "active", statement: "The local daemon owns private project context." },
      { id: "D002", status: "superseded", statement: "Use source-repo symlinks for context." },
      { id: "D003", status: "retracted", statement: "Store raw chat transcripts as memory." },
    ],
    activeDesign: {
      id: "context-spine",
      title: "Project context spine",
      successCriteria: ["Every run records an immutable context digest.", "Replay reconstructs the same context revision."],
      unknowns: ["How should remote backup be configured?"],
    },
    evidenceRefs: ["github:issue-79", "reddit:dotbrain-source"],
    ...overrides,
  };
}

test("snapshot revisions are deterministic and restart-readable", async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = new ProjectContextStore(root);
  const written = await first.writeSnapshot(fixture());
  assert.equal(written.digest, sha256(canonicalJson(written.snapshot)));

  const restarted = new ProjectContextStore(root);
  const current = await restarted.readCurrent("alpha");
  assert.equal(current.digest, written.digest);
  assert.deepEqual(current.snapshot, written.snapshot);
});

test("handoff binds project/worktree/task/run and excludes non-current decisions", async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ProjectContextStore(root);
  await store.writeSnapshot(fixture());

  const handoff = await store.createHandoff({
    projectId: "alpha",
    worktreeId: "wt-17",
    taskId: "task-4",
    runId: "run-9",
    createdAt: "2026-10-08T18:10:00.000Z",
  });

  assert.equal(handoff.schemaVersion, "context-handoff/v1");
  assert.deepEqual(handoff.binding, { projectId: "alpha", worktreeId: "wt-17", taskId: "task-4", runId: "run-9" });
  assert.match(handoff.prompt, /D001/);
  assert.doesNotMatch(handoff.prompt, /D002/);
  assert.doesNotMatch(handoff.prompt, /D003/);
  assert.equal(handoff.promptDigest, sha256(handoff.prompt));

  const replayed = await store.readHandoff("alpha", handoff.handoffId);
  assert.deepEqual(replayed, handoff);
});

test("handoff output is deterministically bounded", async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ProjectContextStore(root);
  await store.writeSnapshot(fixture({ summary: "x".repeat(4000) }));

  const one = await store.createHandoff({ projectId: "alpha", runId: "run-1", budgetChars: 512, createdAt: "2026-10-08T18:11:00.000Z" });
  const two = await store.createHandoff({ projectId: "alpha", runId: "run-1", budgetChars: 512, createdAt: "2026-10-08T18:12:00.000Z" });
  assert.equal(one.truncated, true);
  assert.equal(one.prompt.length, 512);
  assert.equal(one.prompt, two.prompt);
  assert.equal(one.promptDigest, two.promptDigest);
  assert.equal(one.handoffId, two.handoffId);
});

test("project contexts are isolated and unsafe identifiers are rejected", async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ProjectContextStore(root);
  await store.writeSnapshot(fixture());
  await store.writeSnapshot(fixture({ projectId: "beta", revision: "r2", summary: "Beta-only private context." }));

  assert.equal((await store.readCurrent("alpha")).snapshot.summary.includes("Beta"), false);
  assert.equal((await store.readCurrent("beta")).snapshot.summary, "Beta-only private context.");
  await assert.rejects(() => store.readCurrent("../alpha"), /safe non-empty identifier/);
  await assert.rejects(() => store.createHandoff({ projectId: "alpha", worktreeId: "../../escape" }), /safe non-empty identifier/);
});

test("tampered revision and handoff files fail integrity verification", async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ProjectContextStore(root);
  const revision = await store.writeSnapshot(fixture());
  const handoff = await store.createHandoff({ projectId: "alpha", runId: "run-tamper" });

  const revisionPath = path.join(root, "alpha", "revisions", `${revision.digest}.json`);
  const revisionJson = JSON.parse(await fs.readFile(revisionPath, "utf8"));
  revisionJson.snapshot.summary = "tampered";
  await fs.writeFile(revisionPath, JSON.stringify(revisionJson));
  await assert.rejects(() => store.readRevision("alpha", revision.digest), /failed integrity verification/);

  await store.writeSnapshot(fixture({ revision: "r2", updatedAt: "2026-10-08T18:30:00.000Z" }));
  const cleanHandoff = await store.createHandoff({ projectId: "alpha", runId: "run-clean" });
  const handoffPath = path.join(root, "alpha", "handoffs", `${cleanHandoff.handoffId}.json`);
  const handoffJson = JSON.parse(await fs.readFile(handoffPath, "utf8"));
  handoffJson.prompt += "injected";
  await fs.writeFile(handoffPath, JSON.stringify(handoffJson));
  await assert.rejects(() => store.readHandoff("alpha", cleanHandoff.handoffId), /prompt integrity verification/);

  assert.ok(handoff.handoffId);
});
