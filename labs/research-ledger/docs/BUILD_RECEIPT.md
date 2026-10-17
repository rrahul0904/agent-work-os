# Build receipt — Research Ledger v0.3

- Donor: `VikingOwl91/research-bench`
- Classification: donor/reference → existing Research Ledger / Learn Anything capability
- Clean-room: yes
- Canonical branch: `rea/researchbench-convergence`
- Canonical PR: `#219`

## Implemented product surface

- Local PDF/TXT/Markdown/CSV/HTML source notebook with exact passage IDs.
- IndexedDB persistence and deterministic lexical retrieval.
- Opt-in multilingual semantic search and grounded-brief retrieval using a browser Web Worker.
- Semantic model provenance: `Xenova/multilingual-e5-small`, revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, Transformers.js `3.8.1`, `q8`, normalized mean pooling, E5 `query:` / `passage:` prefixes.
- Semantic indexing bounded to 240 chunks with deterministic round-robin source coverage.
- Brief retrieval choices: **Lexical · default**, **Semantic · experimental**, **Hybrid RRF · experimental**.
- Hybrid uses deterministic reciprocal-rank fusion (`k=60`) rather than combining incompatible raw lexical/cosine scores.
- Semantic/hybrid failures automatically fall back to lexical ranking and record the fallback in brief metadata/lineage.
- Experimental rankings are reconciled to exact local passage IDs, including persisted captured-source IDs.
- Optional bounded provider synthesis receives only final retrieved passages.
- Summary, FAQ, Study Guide and cited two-host Podcast Studio outputs.
- Durable captured sources, up to 50 research snapshots, replay/diff and evidence hashes.
- Portable `research-ledger/notebook.v1` import/export and Agent Work OS handoff.
- PDF page-marker provenance and local/remote evidence drift controls.
- Bounded `/api/source-status` public-URL freshness checks with DNS pinning/private-network refusal.
- Portable Node routes for `/`, `/health`, `/api/research`, `/api/source-status` plus benchmark/browser assets.

## Retrieval benchmark receipt

- Benchmark: `research-ledger/retrieval-benchmark.v2`
- Exact benchmark head: `8a1c173342516fb3f37d74f75aded97f3cfe62d3`
- Real-browser run: `38997319448`; job `117292607265`
- Artifact: `12087960601`
- Artifact digest: `sha256:40377640c90b782bdc8f2a088c31388332fe217311d05921cf347f2d898f55c1`
- 20 cases / 15 passages / 8 language codes
- Lexical: Recall@5 **85.0%**, MRR **0.767**
- Semantic: Recall@5 **100.0%**, MRR **0.900**
- Hybrid: Recall@5 **100.0%**, MRR **0.867**
- Multilingual subset: lexical **62.5% / 0.479**, semantic **100% / 0.875**, hybrid **100% / 0.792**
- English subset: lexical **100% / 0.958**, semantic **100% / 0.917**, hybrid **100% / 0.917**
- Receipt decision: semantic is the fixture leader; hybrid is not eligible for default promotion.
- Policy: lexical remains default; semantic and hybrid remain explicit experiments. See `docs/RETRIEVAL_BENCHMARK.md`.

## Hardening receipts

- Dedicated path-scoped `research-ledger-ci` runs `npm run check` independently of unrelated Agent Work OS tests.
- Product gates cover syntax, API/security, executable IndexedDB schema compatibility, semantic retrieval, semantic/hybrid brief modes, RRF, benchmark corpus/math and the portable runtime.
- Real-browser `research-ledger-benchmark` installs Chromium, loads the exact pinned model, executes the corpus and uploads a JSON receipt.
- Browser inference CSP was corrected after the first cold run exposed the missing WebAssembly capability. Both portable and Vercel CSPs now include scoped `'wasm-unsafe-eval'` while explicitly refusing general `'unsafe-eval'`.
- Benchmark workflow retriggers on semantic/model, benchmark, portable-server, CSP/Vercel config and workflow changes.
- Portable runtime uses an explicit static allowlist and smoke tests all shipped CSS/JS/semantic/hybrid/benchmark assets.
- URL freshness requests refuse credential-bearing/private/IP-literal destinations, validate DNS answers, pin outbound connections to vetted addresses and revalidate redirects.

## Privacy / dependency boundary

- Lexical brief retrieval is the default and requires no model download.
- Semantic and hybrid modes are opt-in; no embedding model is downloaded until explicitly selected/used.
- Source passages are read from local IndexedDB and passed to the same-origin Web Worker; they are not sent to an embedding backend.
- If live provider synthesis is enabled, only the final bounded retrieved evidence is sent to `/api/research`.
- Model/runtime downloads are separate from notebook-content traffic.
- Semantic vectors live in worker memory and can be rebuilt from the local evidence set.

## Honest non-claims

- The 20-case benchmark is a curated fixture, not a universal production-quality claim.
- Semantic leads this fixture, especially multilingual retrieval; that does not justify making it the default before representative real-notebook latency/memory/browser evaluation.
- Hybrid RRF protects recall but ranks below semantic on this fixture and remains experimental.
- The semantic index caps coverage at 240 chunks and reports partial coverage for larger notebooks.
- Podcast playback uses browser SpeechSynthesis; downloadable encoded audio is not claimed.
- Full multi-browser/accessibility/capacity testing remains a further hardening lane.

## Gates

- Required product code gate: path-scoped `research-ledger-ci` / `npm run check` on the exact final branch SHA.
- Required semantic-quality regression gate: `research-ledger-benchmark` on inference-boundary changes.
- Parent repository CI is tracked separately because unrelated Agent Work OS systems can fail independently.
- Deployment remains separate: exact-SHA live preview and verification of `/`, `/health`, `/api/research`, `/api/source-status` and referenced browser assets.
- Vercel/Railway account limits remain external shipping blockers; no live deployment is claimed until those gates pass.
