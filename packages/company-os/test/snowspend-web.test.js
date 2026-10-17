import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const publicDir = path.join(root, "apps/web/public/company-os");
const docsDir = path.join(root, "docs/reverse-engineering/fixtures/marcus-company-os");

async function text(file) {
  return readFile(file, "utf8");
}

test("SnowSpend fixture is source-owned, synthetic, and explicit about non-production truth", async () => {
  const [html, js, prd] = await Promise.all([
    text(path.join(publicDir, "index.html")),
    text(path.join(publicDir, "app.js")),
    text(path.join(docsDir, "snowspend-prd.md"))
  ]);

  assert.match(html, /Synthetic Snowflake cost intelligence venture proof/i);
  assert.match(html, /No customer data/i);
  assert.match(html, /not shipped/i);
  assert.match(js, /fixture:warehouse-utilization:bi-analytics/);
  assert.match(js, /Draft created — not published/);
  assert.match(prd, /Total synthetic monthly cost: \*\*\$36,560\*\*/);
  assert.match(prd, /not customer data/i);
});

test("SnowSpend browser fixture contains no external network or provider execution primitive", async () => {
  const js = await text(path.join(publicDir, "app.js"));
  const forbidden = [
    /\bfetch\s*\(/,
    /XMLHttpRequest/,
    /WebSocket\s*\(/,
    /EventSource\s*\(/,
    /sendBeacon\s*\(/,
    /https?:\/\//i,
    /snowflake\.com/i,
    /stripe\.com/i
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(js, pattern);
  }
});

test("SnowSpend evidence board refuses to imply preview/browser verification", async () => {
  const js = await text(path.join(publicDir, "app.js"));
  assert.match(js, /key: "preview", label: "Preview runtime", status: "unknown"/);
  assert.match(js, /key: "browser_uat", label: "Browser UAT", status: "unknown"/);
  assert.match(js, /key: "replay", label: "Company-state replay", status: "passed"/);
});

test("SnowSpend interaction surface is keyboard-operable native HTML controls", async () => {
  const html = await text(path.join(publicDir, "index.html"));
  assert.match(html, /<button id="draft-launch" type="button">/);
  assert.match(html, /<button id="toggle-blocker" class="secondary" type="button">/);
  assert.match(html, /<button id="reset-demo" class="ghost" type="button">/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<table>/);
});
