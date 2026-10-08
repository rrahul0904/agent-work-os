import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareContextInjection } from "../src/context-injection.js";
import { ProjectContextStore, sha256 } from "../src/project-context-store.js";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "agent-work-os-injection-"));
}

function snapshot() {
  return {
    schemaVersion: "project-context/v1",
    projectId: "alpha",
    revision: "r1",
    updatedAt: "2026-10-08T18:00:00.000Z",
    summary: "Private context must stay local while receipts may travel to the control plane.",
    decisions: [{ id: "D001", status: "active", statement: "Emit digests, not private context, in the injection receipt." }],
    constraints: ["No push/merge/deploy authorization is carried by context."],
    evidenceRefs: ["github:issue-79"],
  };
}

test("no context request leaves the user prompt unchanged", async () => {
  const result = await prepareContextInjection({ prompt: "  fix the tests  " });
  assert.equal(result.prompt, "fix the tests");
  assert.equal(result.receipt, null);
  assert.equal(result.handoff, null);
});

test("context injection prefixes bounded context and emits a content-free receipt", async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ProjectContextStore(root);
  await store.writeSnapshot(snapshot());

  const result = await prepareContextInjection({
    store,
    request: { projectId: "alpha", worktreeId: "wt-1", taskId: "task-2", budgetChars: 1200 },
    prompt: "Implement the dispatch integration.",
    defaultRunId: "session-3",
    createdAt: "2026-10-08T18:20:00.000Z",
  });

  assert.match(result.prompt, /# Agent Work OS project context/);
  assert.match(result.prompt, /# User task\nImplement the dispatch integration\./);
  assert.equal(result.receipt.schemaVersion, "context-injection-receipt/v1");
  assert.deepEqual(result.receipt.binding, { projectId: "alpha", worktreeId: "wt-1", taskId: "task-2", runId: "session-3" });
  assert.equal(result.receipt.combinedPromptDigest, sha256(result.prompt));
  assert.equal(JSON.stringify(result.receipt).includes(snapshot().summary), false);
  assert.equal(JSON.stringify(result.receipt).includes("Emit digests"), false);
});

test("missing context fails closed instead of silently dropping requested context", async (t) => {
  const root = await tempRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ProjectContextStore(root);
  await assert.rejects(
    () => prepareContextInjection({ store, request: { projectId: "missing" }, prompt: "do work", defaultRunId: "run-1" }),
    /ENOENT/,
  );
});
