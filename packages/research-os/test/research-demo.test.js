import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("fixture Research OS CLI runs end-to-end with stable, explicitly synthetic receipts", () => {
  const script = fileURLToPath(new URL("../../../scripts/research-demo.mjs", import.meta.url));
  const run = () => JSON.parse(execFileSync(process.execPath, [script], { encoding: "utf8", timeout: 10_000 }));
  const first = run();
  const second = run();
  assert.equal(first.mode, "SYNTHETIC_FIXTURE_ONLY");
  assert.equal(first.realProviderConnected, false);
  assert.equal(first.externalNetworkCalls, 0);
  assert.equal(first.factualWorldVerification, false);
  assert.equal(first.evidenceCount, 2);
  assert.equal(first.queryCount, 1);
  assert.equal(first.claimStatus, "supported");
  assert.equal(first.evaluationStatus, "PASSED");
  assert.equal(first.replayStable, true);
  assert.deepEqual(first, second);
  assert.equal(first.citations.every((c) => c.synthetic), true);
});
