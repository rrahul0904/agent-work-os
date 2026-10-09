import test from "node:test";
import assert from "node:assert/strict";
import { handleProjectDeskRequest } from "../src/project-desk-routes.js";
import { ProjectDeskError } from "../src/project-desk.js";

function response() { return { status: null, body: null }; }
function json(res, status, body) { res.status = status; res.body = body; }
async function readJson(req) { return req.body ?? {}; }

test("Project Desk paths require authorization before reads", async () => {
  const res = response();
  const handled = await handleProjectDeskRequest(
    { method: "GET" }, res, new URL("http://localhost/api/work-items"),
    { desk: {}, json, readJson, authorize: () => false },
  );
  assert.equal(handled, true);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: "control_token_required" });
});

test("authorized work-item read returns authoritative facts", async () => {
  const desk = { listWorkItems: () => [{ id: "w1", title: "Ship" }] };
  const res = response();
  const handled = await handleProjectDeskRequest(
    { method: "GET" }, res, new URL("http://localhost/api/work-items"),
    { desk, json, readJson, authorize: () => true },
  );
  assert.equal(handled, true);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.workItems, [{ id: "w1", title: "Ship" }]);
});

test("authorized mutation delegates actor and preserves domain errors", async () => {
  const desk = {
    async claimWorkItem(id, actor) {
      assert.equal(id, "w1");
      assert.deepEqual(actor, { id: "codex", kind: "agent" });
      throw new ProjectDeskError("work_item_already_owned", "already owned", 409);
    },
  };
  const res = response();
  const handled = await handleProjectDeskRequest(
    { method: "POST", body: { actor: { id: "codex", kind: "agent" } } },
    res,
    new URL("http://localhost/api/work-items/w1/claim"),
    { desk, json, readJson, authorize: () => true },
  );
  assert.equal(handled, true);
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: "work_item_already_owned", message: "already owned" });
});

test("unrelated paths are not intercepted", async () => {
  const res = response();
  const handled = await handleProjectDeskRequest(
    { method: "GET" }, res, new URL("http://localhost/api/rooms"),
    { desk: {}, json, readJson, authorize: () => { throw new Error("should not authorize"); } },
  );
  assert.equal(handled, false);
  assert.equal(res.status, null);
});
