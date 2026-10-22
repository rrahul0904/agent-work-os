import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getForgeReleaseReadiness } from "../src/forge-feature-readiness.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
test("complete Forge feature inventory never confuses coding progress with release proof", async () => {
  const report = getForgeReleaseReadiness();
  const names = report.features.map(f => f.id);
  assert.equal(report.schema, "rea-forge-release-readiness/v1");
  assert.equal(names.length, 14);
  assert.equal(new Set(names).size, names.length);
  assert.ok(report.counts.localImplementation > 0);
  assert.ok(report.counts.missingOrBlocked > 0);
  assert.equal(report.counts.localImplementation + report.counts.missingOrBlocked, report.counts.total);
  assert.equal(report.counts.releaseVerified, 0);
  assert.equal(report.releaseReady, false);
  assert.equal(report.deployed, false);
  assert.ok(report.missing.includes("shipping-integration"));
  assert.ok(report.missing.includes("rea-research"));
  assert.ok(report.missing.includes("tracker-sync"));
  assert.ok(report.missing.includes("production-scheduling"));
  for (const feature of report.features) {
    assert.ok(feature.title.length > 4);
    assert.ok(feature.unresolved.length > 8);
    assert.ok(["implemented_local", "not_implemented"].includes(feature.stage));
    if (feature.stage === "implemented_local") {
      assert.ok(feature.evidence.length > 0);
      for (const file of feature.evidence) {
        assert.ok(!path.isAbsolute(file) && !file.includes(".."), "relative evidence path");
        await access(path.join(root, file));
      }
    } else assert.equal(feature.evidence.length, 0);
  }
});
test("feature readiness snapshots cannot mutate canonical catalog", () => {
  const first = getForgeReleaseReadiness();
  first.features[0].stage = "shipped";
  first.features[0].evidence.push("fake-proof");
  const second = getForgeReleaseReadiness();
  assert.equal(second.features[0].stage, "implemented_local");
  assert.equal(second.releaseReady, false);
  assert.ok(!second.features[0].evidence.includes("fake-proof"));
});
