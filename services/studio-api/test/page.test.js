import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../../../apps/studio/public");

test("Agent Studio page exposes the governed workflow and avoids inline executable script", async () => {
  const [html, js, css] = await Promise.all([
    readFile(path.join(web, "index.html"), "utf8"),
    readFile(path.join(web, "app.js"), "utf8"),
    readFile(path.join(web, "styles.css"), "utf8")
  ]);
  assert.match(html, /Create a draft/);
  assert.match(html, /Preflight & launch/);
  assert.match(html, /Run receipts/);
  assert.match(html, /script type="module" src="\/app\.js"/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/i);
  assert.match(js, /\/api\/studio\/agents/);
  assert.match(js, /Immutable version published/);
  assert.match(css, /@media \(max-width: 600px\)/);
});
