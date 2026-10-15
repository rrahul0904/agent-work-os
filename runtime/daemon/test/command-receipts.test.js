import assert from "node:assert/strict";
import test from "node:test";
import { createCommandReceiptCache } from "../src/command-receipts.js";

test("command receipt cache suppresses in-flight and acknowledged retries", () => {
  const receipts = createCommandReceiptCache(2);
  assert.deepEqual(receipts.begin("command-a"), { kind: "new" });
  assert.deepEqual(receipts.begin("command-a"), { kind: "in_flight" });
  receipts.complete("command-a", { ok: true });
  assert.deepEqual(receipts.begin("command-a"), { kind: "duplicate", receipt: { ok: true } });
});

test("command receipt cache evicts the oldest bounded receipt", () => {
  const receipts = createCommandReceiptCache(2);
  for (const commandId of ["command-a", "command-b", "command-c"]) {
    assert.equal(receipts.begin(commandId).kind, "new");
    receipts.complete(commandId, { ok: true });
  }
  assert.deepEqual(receipts.begin("command-a"), { kind: "new" });
  assert.deepEqual(receipts.begin("command-b"), { kind: "duplicate", receipt: { ok: true } });
});
