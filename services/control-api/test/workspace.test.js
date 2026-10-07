import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { JsonStore } from "../src/store.js";
import { WorkspaceError } from "../src/workspace.js";

test("work board persists projects, tasks, workdays and notes", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-workspace-"));
  const file = path.join(dir, "state.json");
  const store = new JsonStore(file); await store.load();
  const project = await store.createProject({ name: "Launch slice" });
  const task = await store.createTask({ projectId: project.id, title: "Ship verified slice", dueDate: "2026-10-08", priority: "high" });
  await store.updateTask(task.id, { status: "done" });
  await store.createWorkday({ date: "2026-10-07", startedAt: "2026-10-07T13:00:00Z", endedAt: "2026-10-07T15:15:00Z", breakMinutes: 15 });
  await store.createNote({ projectId: project.id, title: "Evidence", body: "Exact-SHA verification required." });
  await store.createCalendarEvent({ projectId: project.id, title: "UAT", startAt: "2026-10-08T14:00:00Z" });

  const reloaded = new JsonStore(file); await reloaded.load();
  const snapshot = reloaded.getWorkspace();
  assert.equal(snapshot.projects.length, 1);
  assert.equal(snapshot.tasks[0].status, "done");
  assert.ok(snapshot.tasks[0].completedAt);
  assert.equal(snapshot.workdays[0].netMinutes, 120);
  assert.equal(snapshot.notes[0].title, "Evidence");
  assert.equal(snapshot.events[0].title, "UAT");
  assert.equal(snapshot.metrics.completedTasks, 1);
});

test("work board rejects dangling project references and clears completedAt when reopened", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-workspace-"));
  const store = new JsonStore(path.join(dir, "state.json")); await store.load();
  await assert.rejects(() => store.createTask({ projectId: "missing", title: "Nope" }), (error) => error instanceof WorkspaceError && error.code === "project_not_found");
  const project = await store.createProject({ name: "One" });
  const task = await store.createTask({ projectId: project.id, title: "Toggle me" });
  const done = await store.updateTask(task.id, { status: "done" });
  assert.ok(done.completedAt);
  const reopened = await store.updateTask(task.id, { status: "todo" });
  assert.equal(reopened.completedAt, null);
});

test("workday net minutes never becomes negative", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-workspace-"));
  const store = new JsonStore(path.join(dir, "state.json")); await store.load();
  const day = await store.createWorkday({ date: "2026-10-07", startedAt: "2026-10-07T13:00:00Z", endedAt: "2026-10-07T13:10:00Z", breakMinutes: 30 });
  assert.equal(day.netMinutes, 0);
});
