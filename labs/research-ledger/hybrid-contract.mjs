import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HYBRID_RRF_K, reciprocalRankFusion } from './semantic-core.js';

const root = dirname(fileURLToPath(import.meta.url));
const [html, app, semantic, hybrid, runtime] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'app.js'), 'utf8'),
  readFile(resolve(root, 'semantic-search.js'), 'utf8'),
  readFile(resolve(root, 'hybrid-brief.js'), 'utf8'),
  readFile(resolve(root, 'railway-server.mjs'), 'utf8')
]);

assert.equal(HYBRID_RRF_K, 60);
const fused = reciprocalRankFusion([
  { name: 'lexical', results: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] },
  { name: 'semantic', results: [{ id: 'B' }, { id: 'D' }, { id: 'A' }] }
], 4);
assert.equal(fused[0].id, 'B', 'document ranked highly by both systems should lead RRF');
assert.deepEqual(new Set(fused[0].sources), new Set(['lexical', 'semantic']));
assert.ok(fused.find(item => item.id === 'A').score > fused.find(item => item.id === 'C').score, 'cross-ranking evidence should beat one-list-only evidence');

assert.match(html, /<script src="\/db-schema\.js"><\/script>/, 'schema shim must execute as a classic script');
assert.match(html, /<script src="\/app\.js"><\/script>/, 'app must execute as a classic script so the bounded hybrid bridge can reuse existing state/render functions');
assert.match(html, /<script type="module" src="\/semantic-search\.js"><\/script>/);
assert.match(html, /<script src="\/hybrid-brief\.js"><\/script>/);
assert.ok(html.indexOf('src="/db-schema.js"') < html.indexOf('src="/app.js"'));
assert.ok(html.indexOf('src="/semantic-search.js"') < html.indexOf('src="/hybrid-brief.js"'));

assert.match(app, /const state =/);
assert.match(app, /function retrieve\(/);
assert.match(app, /function localBrief\(/);
assert.match(app, /function renderBrief\(/);
assert.match(semantic, /window\.ResearchLedgerSemantic = Object\.freeze\(\{ hybridRetrieve \}\)/);
assert.match(semantic, /reciprocalRankFusion\(/);
assert.match(semantic, /<option value="lexical">Lexical · default<\/option>/);
assert.match(semantic, /<option value="hybrid">Hybrid RRF · experimental<\/option>/);
assert.match(hybrid, /window\.ResearchLedgerSemantic/);
assert.match(hybrid, /bridge\.hybridRetrieve\(question, lexical, 10\)/);
assert.match(hybrid, /mode: 'hybrid-rrf'/);
assert.match(hybrid, /mode: 'lexical-fallback'/);
assert.match(hybrid, /originalCreateBrief\?\.call/, 'lexical mode must delegate back to the original app path');
assert.match(hybrid, /event\.stopImmediatePropagation\(\)/, 'hybrid keyboard shortcut must prevent the original lexical handler from also firing');
assert.match(runtime, /'hybrid-brief\.js'/);

// Prove the browser-language seam used by the bridge: global lexical declarations in
// an earlier classic script remain addressable by a later classic script without being
// attached as object properties.
const classicContext = vm.createContext({ globalThis: {} });
vm.runInContext('const state={mode:"answer"}; function retrieve(){return state.mode;} function renderBrief(v){state.value=v;}', classicContext);
vm.runInContext('state.mode="hybrid"; renderBrief(retrieve()); globalThis.result=state.value;', classicContext);
assert.equal(classicContext.globalThis.result, 'hybrid');

console.log('research-ledger hybrid brief retrieval contract passed');
