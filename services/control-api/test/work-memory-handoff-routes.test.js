import test from "node:test";
import assert from "node:assert/strict";
import { handleWorkMemoryHandoffRequest } from "../src/work-memory-handoff-routes.js";
import { WorkMemoryHandoffError } from "../src/work-memory-handoff.js";

function response() { return { status: null, body: null }; }
function json(res, status, body) { res.status = status; res.body = body; }
async function readJson(req) { return req.body ?? {}; }

test("handoff route requires authorization", async () => {
  const res = response();
  const handled = await handleWorkMemoryHandoffRequest(
    { method: "POST", body: { fromSessionId: "s1" } },
    res,
    new URL("http://localhost/api/work-items/w1/handoffs"),
    { service: {}, json, readJson, authorize: () => false },
  );
  assert.equal(handled, true);
  assert.equal(res.status, 401);
});

test("handoff route delegates to verified handoff service", async () => {
  const expected = { receipt: { schema: "work-memory-handoff-receipt/v1", workId: "w1" } };
  const service = {
    async create(id, body) {
      assert.equal(id, "w1");
      assert.deepEqual(body, { fromSessionId: "s1", nextAction: "continue" });
      return expected;
    },
  };
  const res = response();
  const handled = await handleWorkMemoryHandoffRequest(
    { method: "POST", body: { fromSessionId: "s1", nextAction: "continue" } },
    res,
    new URL("http://localhost/api/work-items/w1/handoffs"),
    { service, json, readJson, authorize: () => true },
  );
  assert.equal(handled, true);
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, expected);
});

test("handoff route preserves bounded service errors", async () => {
  const service = {
    async create() { throw new WorkMemoryHandoffError("source_session_not_found", "missing", 404); },
  };
  const res = response();
  const handled = await handleWorkMemoryHandoffRequest(
    { method: "POST", body: { fromSessionId: "missing" } },
    res,
    new URL("http://localhost/api/work-items/w1/handoffs"),
    { service, json, readJson, authorize: () => true },
  );
  assert.equal(handled, true);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: "source_session_not_found", message: "missing" });
});

test("unrelated paths are not intercepted", async () => {
  const res = response();
  const handled = await handleWorkMemoryHandoffRequest(
    { method: "POST" },
    res,
    new URL("http://localhost/api/rooms"),
    { service: {}, json, readJson, authorize: () => { throw new Error("should not run"); } },
  );
  assert.equal(handled, false);
});
