import fs from 'node:fs';

const path = new URL('../apps/web/public/design-supply-lab/index.html', import.meta.url);
const html = fs.readFileSync(path, 'utf8');

const checks = [
  ['HTML doctype', /^<!doctype html>/i.test(html)],
  ['responsive viewport', html.includes('name="viewport"')],
  ['catalog mount', html.includes('id="catalogGrid"')],
  ['search control', html.includes('id="search"')],
  ['category filter', html.includes('id="category"')],
  ['platform filter', html.includes('id="platform"')],
  ['access filter', html.includes('id="access"')],
  ['preview modal', html.includes('id="previewModal"')],
  ['prompt builder', html.includes('id="promptOutput"')],
  ['favorites persistence', html.includes('dsl-favorites')],
  ['unlock persistence', html.includes('dsl-unlocked')],
  ['credit persistence', html.includes('dsl-credits')],
  ['clean-room disclosure', html.includes('clean-room')],
  ['mobile breakpoint', html.includes('@media(max-width:680px)')],
  ['no target production asset/domain reference', !html.includes('supply.madebyoversight.com') && !html.includes('madebyoversight.com')],
];

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i);
checks.push(['inline application script found', Boolean(scriptMatch)]);
if (scriptMatch) {
  try {
    // Compile only. Browser globals are intentionally not executed in Node.
    new Function(scriptMatch[1]);
    checks.push(['application JavaScript parses', true]);
  } catch (error) {
    checks.push([`application JavaScript parses (${error.message})`, false]);
  }
}

const templateCount = (html.match(/\{id:'[^']+',name:/g) || []).length;
checks.push([`at least 12 original catalog entries (${templateCount})`, templateCount >= 12]);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} Design Supply Lab verification check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} Design Supply Lab verification checks passed.`);
