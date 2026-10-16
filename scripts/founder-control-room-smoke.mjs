import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "apps/web/public/founder-control-room.html"), "utf8");
const evidence = await readFile(path.join(root, "docs/reverse-engineering/sumolevel-founder-control-room/README.md"), "utf8");

for (const token of [
  "Founder Control Room",
  "Generate governed launch plan",
  "Buyer signals",
  "AI council",
  "Evidence ledger",
  "Approval required",
  "REA boundary"
]) {
  assert.ok(html.includes(token), `missing required UI token: ${token}`);
}

for (const token of [
  "Clean-room boundary",
  "Agent Work OS remains the authority",
  "Phase 0",
  "Phase 6",
  "Why this action?"
]) {
  assert.ok(evidence.includes(token), `missing required evidence token: ${token}`);
}

assert.ok(!/<script[^>]+src=/i.test(html), "Phase-0 page must not depend on third-party runtime scripts");
assert.ok(!/<img\b/i.test(html), "Phase-0 page must not copy or depend on target imagery");
assert.ok(!/sumolevel/i.test(html), "Target branding must not appear in the shipped UI");
assert.ok(html.includes("localStorage"), "demo plan/receipt persistence is required");
assert.ok(html.includes("runAction"), "governed demo action path is required");

console.log("Founder Control Room smoke gate passed");
