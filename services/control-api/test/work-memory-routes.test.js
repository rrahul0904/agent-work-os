import test from "node:test";
import assert from "node:assert/strict";
import { handleWorkMemoryRequest } from "../src/work-memory-routes.js";
import { WorkMemoryProjectionError } from "../src/work-memory-projection.js";

function response() { return { status: null, body: null }; }
function json(res, status, body) { res.status = status; res.body = body; }

test("GET work-memory route returns the read-only projection", () => {
  const expected = { schema: "work-memory-projection/v1", workId: "w1", authority: { mutableThroughProjection: false } };
  const service = { getProjection(id) { assert.equal(id, "w1"); return expected; } };
  const res = response();
  const handled = handleWorkMemoryRequest(
    { method: "GET" },
    res,
    new URL("http://localhost/api/work-items/w1/work-memory"),
    { service, json },
  );
  assert.equal(handled, true);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, expected);
});

test("route is GET-only and does not expose a mutation path", () => {
  const service = { getProjection() { throw new Error("should not be called"); } };
  const res = response();
  const handled = handleWorkMemoryRequest(
    { method: "POST" },
    res,
    new URL("http://localhost/api/work-items/w1/work-memory"),
    { service, json },
  );
  assert.equal(handled, false);
  assert.equal(res.status, null);
});

test("unknown work item is returned as a bounded 404", () => {
  const service = {
    getProjection() { throw new WorkMemoryProjectionError("work_item_not_found", "Unknown work item: missing"); },
  };
  const res = response();
  const handled = handleWorkMemoryRequest(
    { method: "GET" },
    res,
    new URL("http://localhost/api/work-items/missing/work-memory"),
    { service, json },
  );
  assert.equal(handled, true);
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: "work_item_not_found", message: "Unknown work item: missing" });
});
