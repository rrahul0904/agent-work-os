import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEMANTIC_MODEL_ID,
  SEMANTIC_MODEL_REVISION,
  TRANSFORMERS_JS_VERSION,
  SEMANTIC_MAX_CHUNKS,
  semanticChunkText,
  buildSemanticChunks,
  selectCoverageChunks,
  lexicalRank,
  rankOverlap
} from './semantic-core.js';

const root = dirname(fileURLToPath(import.meta.url));
const [html, worker, controller, runtime] = await Promise.all([
  readFile(resolve(root, 'index.html'), 'utf8'),
  readFile(resolve(root, 'semantic-worker.js'), 'utf8'),
  readFile(resolve(root, 'semantic-search.js'), 'utf8'),
  readFile(resolve(root, 'railway-server.mjs'), 'utf8')
]);

assert.equal(SEMANTIC_MODEL_ID, 'Xenova/multilingual-e5-small');
assert.equal(SEMANTIC_MODEL_REVISION, '761b726dd34fb83930e26aab4e9ac3899aa1fa78');
assert.equal(TRANSFORMERS_JS_VERSION, '3.8.1');
assert.equal(SEMANTIC_MAX_CHUNKS, 240);

const chunks = semanticChunkText('First paragraph has enough content to become a stable retrieval chunk.\n\nSecond paragraph also has enough content to remain grounded.', 'DOC1', 'Doc 1');
assert.equal(chunks[0].id, 'DOC1.C1');
assert.equal(chunks[0].docId, 'DOC1');

const built = buildSemanticChunks(
  [
    { id: 'A', name: 'Alpha', text: 'Apples and pears are fruit. This paragraph is deliberately long enough for chunking.' },
    { id: 'B', name: 'Beta', text: 'Bananas are yellow fruit. This paragraph is deliberately long enough for chunking.' }
  ],
  [{ id: 'C', title: 'Gamma', text: 'Trains move people between cities. This paragraph is deliberately long enough for chunking.' }]
);
assert.deepEqual(new Set(built.map(item => item.docId)), new Set(['A', 'B', 'C']));

const synthetic = [];
for (const docId of ['A', 'B', 'C']) {
  for (let i = 0; i < 120; i += 1) synthetic.push({ id: `${docId}.C${i + 1}`, docId, title: docId, text: `passage ${i} for ${docId}` });
}
const covered = selectCoverageChunks(synthetic, 12);
assert.equal(covered.length, 12);
assert.deepEqual(new Set(covered.map(item => item.docId)), new Set(['A', 'B', 'C']), 'coverage cap must retain every source group');

const lexical = lexicalRank('yellow banana', built, 3);
assert.equal(lexical[0]?.id?.startsWith('B.'), true);
const overlap = rankOverlap([{ id: 'A.C1' }, { id: 'B.C1' }], [{ id: 'B.C1' }, { id: 'C.C1' }], 2);
assert.deepEqual(overlap, { overlap: 1, limit: 2 });

const schemaIndex = html.indexOf('src="/db-schema.js"');
const appIndex = html.indexOf('src="/app.js"');
const completionIndex = html.indexOf('src="/completion.js"');
const semanticIndex = html.indexOf('src="/semantic-search.js"');
assert.ok(schemaIndex >= 0 && schemaIndex < appIndex && appIndex < completionIndex, 'existing browser boot order must remain intact');
assert.ok(semanticIndex > completionIndex, 'semantic controller must load after the existing research workspace');

assert.match(worker, /passage: \$\{String\(chunk\.text/);
assert.match(worker, /query: \$\{String\(query/);
assert.match(worker, /pooling: 'mean'/);
assert.match(worker, /normalize: true/);
assert.match(worker, /dtype: 'q8'/);
assert.doesNotMatch(worker, /\/api\//, 'semantic worker must not send passages through application APIs');
assert.match(controller, /new Worker\('\/semantic-worker\.js', \{ type: 'module'/);
assert.match(controller, /Your passages are embedded inside a Web Worker and are not sent to the model host/);
assert.doesNotMatch(controller, /fetch\(/, 'semantic controller should use local IndexedDB + worker only');

for (const asset of ['semantic-core.js', 'semantic-worker.js', 'semantic-search.js']) assert.match(runtime, new RegExp(asset.replace('.', '\\.')));
assert.match(runtime, /https:\/\/huggingface\.co/);
assert.match(runtime, /https:\/\/\*\.hf\.co/);

console.log('research-ledger semantic retrieval contract passed');
