import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dir = await mkdtemp(path.join(os.tmpdir(), "agent-work-os-work-board-acceptance-"));
process.env.AGENT_WORK_OS_HOST = "127.0.0.1";
process.env.AGENT_WORK_OS_PORT = "18789";
process.env.AGENT_WORK_OS_STATE_PATH = path.join(dir, "state.json");
const { createControlPlane } = await import("../services/control-api/src/index.js");
const control = await createControlPlane();
await control.listen();
const base = "http://127.0.0.1:18789";

async function request(route, method = "GET", body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json();
  return { response, json };
}

try {
  const project = await request("/api/workspace/projects", "POST", { name: "ProtoWork donor slice" });
  assert.equal(project.response.status, 201);

  const dangling = await request("/api/workspace/tasks", "POST", { projectId: "missing", title: "invalid" });
  assert.equal(dangling.response.status, 404);
  assert.equal(dangling.json.error, "project_not_found");

  const task = await request("/api/workspace/tasks", "POST", { projectId: project.json.id, title: "Verify API round trip", priority: "high", dueDate: "2026-10-08" });
  assert.equal(task.response.status, 201);
  const done = await request(`/api/workspace/tasks/${task.json.id}`, "PATCH", { status: "done" });
  assert.equal(done.response.status, 200);
  assert.ok(done.json.completedAt);
  const reopened = await request(`/api/workspace/tasks/${task.json.id}`, "PATCH", { status: "todo" });
  assert.equal(reopened.json.completedAt, null);

  const event = await request("/api/workspace/events", "POST", { projectId: project.json.id, title: "Review", startAt: "2026-10-08T14:00:00Z" });
  assert.equal(event.response.status, 201);
  const workday = await request("/api/workspace/workdays", "POST", { date: "2026-10-07", startedAt: "2026-10-07T13:00:00Z", endedAt: "2026-10-07T15:00:00Z", breakMinutes: 15 });
  assert.equal(workday.json.netMinutes, 105);
  const note = await request("/api/workspace/notes", "POST", { projectId: project.json.id, title: "Evidence", body: "API acceptance receipt" });
  assert.equal(note.response.status, 201);
  const updatedNote = await request(`/api/workspace/notes/${note.json.id}`, "PATCH", { body: "API acceptance receipt captured" });
  assert.equal(updatedNote.json.body, "API acceptance receipt captured");

  const snapshot = await request("/api/workspace");
  assert.equal(snapshot.response.status, 200);
  assert.equal(snapshot.json.projects.length, 1);
  assert.equal(snapshot.json.tasks.length, 1);
  assert.equal(snapshot.json.events.length, 1);
  assert.equal(snapshot.json.workdays.length, 1);
  assert.equal(snapshot.json.notes.length, 1);
  assert.equal(snapshot.json.metrics.openTasks, 1);
  assert.equal(typeof snapshot.json.motivation, "string");
  console.log("work-board acceptance: PASS");
} finally {
  await control.close();
}
