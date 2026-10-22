import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));

test("Forge browser/CLI scripts parse in the exact checked-out source tree", () => {
  for (const item of [
    "apps/web/public/forge.js",
    "apps/web/public/forge-graph.js",
    "runtime/daemon/src/codex-activity.js",
    "services/control-api/src/forge-plan.js",
    "services/control-api/src/forge-supervisor.js",
    "services/control-api/src/forge-intake.js",
    "services/control-api/src/forge-report.js",
    "scripts/forge.mjs",
    "scripts/forge-handoff.mjs",
    "scripts/forge-demo.mjs",
    "services/control-api/src/forge-demo.js",
    "runtime/verifier/forge-readonly-verifier.js",
    "runtime/verifier/forge-handoff-check.js",
    "runtime/daemon/src/forge-independent-review.js",
    ".codex/hooks/rea-forge-observe.mjs"
  ]) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, item)], { encoding: "utf8" });
    assert.equal(result.status, 0, item + " syntax: " + result.stderr);
  }
});

test("Forge HTML declares all controls referenced by the controller", () => {
  const html = readFileSync(path.join(root, "apps/web/public/forge.html"), "utf8");
  const js = readFileSync(path.join(root, "apps/web/public/forge.js"), "utf8");
  for (const id of [
    "forge-create", "forge-create-button", "forge-approve", "forge-stop", "forge-template",
    "forge-plan-json", "forge-plan-select", "forge-plan-summary", "forge-supervisor-state",
    "forge-export", "graph", "inspect-content", "filter", "count-plan", "count-task",
    "count-machine", "count-session", "count-activity", "count-subagent", "count-shipping", "count-work"
  ]) {
    assert.ok(html.includes("id=\"" + id + "\""), "HTML missing " + id);
    if (id.startsWith("count-")) assert.ok(js.includes('"#count-" + kind'), "JS missing dynamic count selector");
    else assert.ok(js.includes(id), "JS missing " + id);
  }
  assert.ok(html.includes('src="/forge.js"'));
  assert.ok(html.includes('href="/forge.css"'));
});
