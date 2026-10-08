import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";

test("shipping runs persist and reload with terminal evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "store-product-"));
  const file = path.join(root, "state.json");
  const store = new JsonStore(file);
  await store.load();
  await store.upsertShippingRun({ runId: "ship-1", projectId: "p1", state: "SHIPPED", updatedAt: "2026-10-08T00:00:00Z", releaseReceipt: { status: "PASS" } });
  const reloaded = new JsonStore(file);
  await reloaded.load();
  assert.equal(reloaded.getShippingRun("ship-1").state, "SHIPPED");
  assert.equal(reloaded.listShippingRuns()[0].releaseReceipt.status, "PASS");
});
